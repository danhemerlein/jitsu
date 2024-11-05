import {
  createClient,
  ProfileBuilder,
  mongodb,
  ProfilesConfig,
  pbEnsureMongoCollection,
  profileIdHashColumn,
  int32Hash,
  idHash32MaxValue,
  EventsStore,
  bulkerDestination,
  FunctionContext,
  FunctionChainContext,
  profileIdColumn,
  ProfileUser,
} from "@jitsu/core-functions";
import { FindCursor, MongoClient, ObjectId, WithId, Document } from "mongodb";
import { db, ProfileBuilderState } from "./lib/db";
import { getLog, getSingleton, hash, LogFactory, parseNumber, requireDefined, stopwatch } from "juava";
import PQueue from "p-queue";
import NodeCache from "node-cache";
import { buildFunctionChain, FuncChain, runChain } from "./lib/functions-chain";
import { FullContext } from "@jitsu/protocols/functions";
import { AnalyticsServerEvent } from "@jitsu/protocols/analytics";

const bulkerBase = requireDefined(process.env.BULKER_URL, "env BULKER_URL is not defined");
const bulkerAuthKey = requireDefined(process.env.BULKER_AUTH_KEY, "env BULKER_AUTH_KEY is not defined");

const concurrency = parseNumber(process.env.CONCURRENCY, 10);
const fetchTimeoutMs = parseNumber(process.env.FETCH_TIMEOUT_MS, 2000);

const instanceIndex = process.env.INSTANCE_INDEX ? parseInt(process.env.INSTANCE_INDEX, 10) : 0;
const totalInstances = process.env.INSTANCES_COUNT ? parseInt(process.env.INSTANCES_COUNT, 10) : 1;
const partitionsRange = selectRange(idHash32MaxValue, totalInstances, instanceIndex);

//cache function chains for 1m
const funcsChainTTL = 60;
const funcsChainCache = new NodeCache({ stdTTL: funcsChainTTL, checkperiod: 60, useClones: false });

const funcCtx: FunctionContext = {
  function: {
    id: "profile-builder",
    type: "profile-builder",
  },
  props: {},
};

console.log(
  `Starting profile builder with instance index ${instanceIndex} of ${totalInstances} and partitions range ${partitionsRange}`
);

export type ProfileBuilderRunner = {
  start: () => Promise<void>;
  close: () => Promise<void>;
  version: () => number;
  state: () => ProfileBuilderState;
};

export async function profileBuilder(
  workspaceId: string,
  profileBuilder: ProfileBuilder,
  eventsLogger: EventsStore
): Promise<ProfileBuilderRunner> {
  const pbLongId = `${workspaceId}-${profileBuilder.id}-v${profileBuilder.version}`;
  const log = getLog(`pb-${pbLongId}`);
  let state: ProfileBuilderState = {
    profileBuilderId: profileBuilder.id,
    profileBuilderVersion: profileBuilder.version,
    startedAt: new Date(),
    updatedAt: new Date(),
    lastTimestamp: undefined,
    instanceIndex,
    totalInstances,
    processedUsers: 0,
    errorUsers: 0,
    totalUsers: 0,
    speed: 0,
  };
  let closed = false;
  let closeResolve;
  const closePromise = new Promise((resolve, reject) => {
    closeResolve = resolve;
  });

  const cacheKey = pbLongId;
  let funcChain: FuncChain | undefined = funcsChainCache.get(cacheKey);
  if (!funcChain) {
    log.atInfo().log(`Refreshing function chain`);
    funcChain = buildFunctionChain(profileBuilder, eventsLogger, fetchTimeoutMs);
    funcsChainCache.set(cacheKey, funcChain);
  }

  const config = ProfilesConfig.parse({
    ...profileBuilder.intermediateStorageCredentials,
    profileWindowDays: profileBuilder.connectionOptions.profileWindow,
    eventsDatabase: `profiles`,
    eventsCollectionName: `profiles-raw-${workspaceId}-${profileBuilder.id}`,
    traitsCollectionName: `profiles-traits-${workspaceId}-${profileBuilder.id}`,
  });

  const mongoSingleton = config.mongoUrl
    ? getSingleton(
        `profiles-mongodb-${profileBuilder.id}-${hash("md5", config.mongoUrl)}`,
        () => {
          log.atInfo().log(`Connecting to MongoDB server.`);
          const cl = createClient({
            mongoUrl: config.mongoUrl,
          } as ProfilesConfig);
          log.atInfo().log(`Connected successfully to MongoDB server.`);
          return cl;
        },
        {
          optional: true,
          ttlSec: 60 * 60 * 24,
          cleanupFunc: client => client.close(),
        }
      )
    : mongodb;

  const mongo = await mongoSingleton.waitInit();

  await pbEnsureMongoCollection(mongo, config.eventsDatabase, config.eventsCollectionName, config.profileWindowDays, [
    profileIdHashColumn,
    profileIdColumn,
    "type",
  ]);
  await pbEnsureMongoCollection(
    mongo,
    config.eventsDatabase,
    config.traitsCollectionName,
    config.profileWindowDays,
    [profileIdColumn],
    true
  );

  const loadedState = await db
    .pgHelper()
    .getProfileBuilderState(profileBuilder.id, profileBuilder.version, totalInstances, instanceIndex);

  state.lastTimestamp = loadedState?.lastTimestamp;

  log.atInfo().log(`Last timestamp: ${state.lastTimestamp}`);

  const queue = new PQueue({ concurrency });

  const pb = {
    start: async () => {
      log.atInfo().log("Started");
      while (!closed) {
        const started = Date.now();
        try {
          const dateUpperBound = new Date();
          dateUpperBound.setSeconds(dateUpperBound.getSeconds() - 1);
          const users = await getUsersHavingEventsSince(mongo, config, dateUpperBound, state.lastTimestamp);
          if (users.length > 0) {
            funcChain?.context.log.info(
              funcCtx,
              `Found ${users.length} users to process since: ${state.lastTimestamp}`
            );
            state.totalUsers = users.length;
            state.processedUsers = 0;
            state.errorUsers = 0;
            state.speed = 0;

            for (let i = 0; i < users.length; i++) {
              if (i % 1000) {
                await db.pgHelper().updateProfileBuilderState(state);
              }
              const user = users[i];
              log.atInfo().log(`Processing user ${i + 1}/${users.length}: ${user}`);
              await queue.onEmpty();
              queue.add(async () =>
                processUser(profileBuilder, state, funcChain!, mongo, log, config, user, dateUpperBound)
              );
            }
            await queue.onIdle();
            state.lastTimestamp = dateUpperBound;
            state.speed = users.length / ((Date.now() - started) / 1000);
            await db.pgHelper().updateProfileBuilderState(state);
          } else {
            funcChain?.context.log.debug(funcCtx, `No users to process since: ${state.lastTimestamp}`);
          }
        } catch (e: any) {
          funcChain?.context.log.error(funcCtx, `Error while running profile builder: ${e.message}`);
        }
        const waitMs = config.runPeriodSec * 1000 - (Date.now() - started);
        if (waitMs > 0) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      closeResolve();
    },
    close: async () => {
      closed = true;
      await Promise.all([queue.onIdle(), closePromise]);
      log.atInfo().log("Closed");
    },
    version: () => profileBuilder.version,
    state: () => state,
  };

  setImmediate(pb.start);

  return pb;
}

async function processUser(
  profileBuilder: ProfileBuilder,
  state: ProfileBuilderState,
  funcChain: FuncChain,
  mongo: MongoClient,
  log: LogFactory,
  config: ProfilesConfig,
  userId: string,
  endTimestamp: Date
) {
  const ms = stopwatch();
  let cursor: FindCursor<WithId<Document>>;
  try {
    const metrics = { db_events: 0 } as any;
    cursor = await getUserEvents(mongo, config, userId, endTimestamp);
    metrics.db_find = ms.lapMs();
    let count = 0;
    const userProvider = async () => {
      const start = Date.now();
      const u = await getProfileUser(mongo, config, userId);
      metrics.db_user = Date.now() - start;
      return u;
    };

    const eventsProvider = async () => {
      const start = Date.now();
      const next = await cursor.next();
      metrics.db_events += Date.now() - start;
      if (next) {
        count++;
        return next as unknown as AnalyticsServerEvent;
      } else {
        return undefined;
      }
    };

    const result = await runChain(userId, funcChain, eventsProvider, userProvider);
    metrics.udf = ms.lapMs();
    metrics.db = metrics.db_events + metrics.db_user + metrics.db_find;
    if (result) {
      await sendToBulker(profileBuilder, result, funcChain.context);
      metrics.bulker = ms.lapMs();
      funcChain.context.log.info(
        funcCtx,
        `User ${userId} processed in ${ms.elapsedMs()}ms (events: ${count}). Result: ${JSON.stringify(
          result
        )} Metrics: ${JSON.stringify(metrics)}`
      );
    } else {
      funcChain.context.log.warn(
        funcCtx,
        `No profile result for user ${userId}. processed in ${ms.elapsedMs()}ms (events: ${count}).  Metrics: ${JSON.stringify(
          metrics
        )}`
      );
    }
    state.processedUsers++;
  } catch (e: any) {
    state.errorUsers++;
    funcChain.context.log.error(funcCtx, `Error while processing user ${userId}: ${e.message}`);
  } finally {
    // @ts-ignore
    cursor?.close();
  }
}

async function sendToBulker(profileBuilder: ProfileBuilder, profile: any, context: FunctionChainContext) {
  const ctx: FullContext<bulkerDestination.BulkerDestinationConfig> = {
    log: {
      error: (message: string, ...args: any[]) => {
        context.log.error(funcCtx, message, ...args);
      },
      info: (message: string, ...args: any[]) => {
        context.log.info(funcCtx, message, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        context.log.warn(funcCtx, message, ...args);
      },
      debug: (message: string, ...args: any[]) => {
        context.log.debug(funcCtx, message, ...args);
      },
    },
    fetch: context.fetch,
    store: context.store,
    props: {
      bulkerEndpoint: bulkerBase,
      destinationId: profileBuilder.id,
      authToken: bulkerAuthKey,
      dataLayout: "passthrough",
    },
    connection: {
      id: profileBuilder.id,
    },
    destination: {
      id: profileBuilder.destinationId,
      type: "",
      hash: "",
    },
    source: {
      id: "",
      type: "s2s",
    },
    headers: {},
    workspace: { id: profileBuilder.workspaceId },
  };
  await bulkerDestination.default(
    {
      [bulkerDestination.TableNameParameter]: profileBuilder.connectionOptions.tableName || "profiles",
      ...profile,
    } as unknown as AnalyticsServerEvent,
    ctx
  );
}

async function getUserEvents(mongo: MongoClient, config: ProfilesConfig, userId: string, endTimestamp: Date) {
  return mongo
    .db(config.eventsDatabase)
    .collection(config.eventsCollectionName)
    .find({
      [profileIdHashColumn]: int32Hash(userId),
      [profileIdColumn]: userId,
      _id: { $lt: new ObjectId(Math.floor(endTimestamp.getTime() / 1000).toString(16) + "0000000000000000") },
    });
}

async function getProfileUser(mongo: MongoClient, config: ProfilesConfig, userId: string): Promise<ProfileUser> {
  const u = await mongo
    .db(config.eventsDatabase)
    .collection(config.traitsCollectionName)
    .findOne({ [profileIdColumn]: userId });
  if (!u) {
    return {
      id: userId,
      anonymousId: "",
      traits: {},
    };
  } else {
    return {
      id: u.userId,
      anonymousId: u.anonymousId,
      traits: u.traits,
    };
  }
}

async function getUsersHavingEventsSince(
  mongo: MongoClient,
  config: ProfilesConfig,
  dateUpperBound: Date,
  lastTimestamp?: Date
) {
  let dateFilter: any = {
    _id: { $lt: new ObjectId(Math.floor(dateUpperBound.getTime() / 1000).toString(16) + "0000000000000000") },
  };
  if (lastTimestamp) {
    dateFilter = {
      $and: [
        {
          _id: { $gte: new ObjectId(Math.floor(lastTimestamp.getTime() / 1000).toString(16) + "0000000000000000") },
        },
        dateFilter,
      ],
    };
  }
  return await mongo
    .db(config.eventsDatabase)
    .collection(config.eventsCollectionName)
    .aggregate([
      {
        $match: {
          ...dateFilter,
          [profileIdHashColumn]: { $gte: partitionsRange[0], $lte: partitionsRange[1] },
        },
      },
      {
        $group: {
          _id: "$" + profileIdColumn,
        },
      },
    ])
    .map(e => e._id as string)
    .toArray();
}

function selectRange(rangeWidth: number, totalInstances: number, instanceIndex: number): [number, number] {
  const rangePerInstance = Math.floor(rangeWidth / totalInstances);
  const remainderRange = rangeWidth % totalInstances;

  const ranges: Array<{ instance: number; partitionRange: [number, number] }> = [];
  let rangeStart = 0;

  for (let i = 0; i < totalInstances; i++) {
    // Each instance gets at least `rangePerInstance` partitions
    // If there are remaining partitions, distribute one extra to some instances
    const additionalRange = i < remainderRange ? 1 : 0;
    const rangeEnd = rangeStart + rangePerInstance + additionalRange - 1;

    ranges.push({
      instance: i,
      partitionRange: [rangeStart, rangeEnd],
    });

    rangeStart = rangeEnd + 1;
  }

  return ranges[instanceIndex].partitionRange;
}
