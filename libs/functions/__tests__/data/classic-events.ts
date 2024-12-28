export const classicEvents = [
  {
    _timestamp: "2024-12-25T14:23:48.606561Z",
    api_key: "js.123.123",
    click_id: {},
    doc_encoding: "UTF-8",
    doc_host: "events.example.com",
    doc_path: "/a-v/123",
    doc_search: "",
    event_type: "user_identify",
    eventn_ctx_event_id: "1d199165-fdf3-4051-82fc-08a8c5502f33",
    ids: {
      ga: "GA1.1.123.123",
    },
    local_tz_offset: 420,
    page_title: "aa.aa.24",
    referer: "",
    screen_resolution: "1680x1050",
    source_ip: "127.0.13.36",
    src: "jitsu",
    url: "https://events.example.com/a-v/123",
    user: {
      anonymous_id: "5adv25gea6",
      email: "user@example.com",
      hashed_anonymous_id: "41217f4f06dba2b145dbd7d0879a871e",
      name: "John Doe",
      uid: "123",
    },
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    user_language: "en-US",
    utc_time: "2024-12-25T14:23:46.483000Z",
    utm: {},
    vp_size: "1384x775",
  },
  {
    _timestamp: "2024-12-25T14:31:48.875505Z",
    api_key: "s2s.123.123",
    common_properties: {
      c_version: "1.1.11",
      client: {
        creation_timestamp: "2024-12-25T14:31:48.794613+00:00",
        id: "123",
      },
      in_v: false,
      a_version: null,
    },
    event_type: "serve_init",
    eventn_ctx_event_id: "99406a96-3bc3-4939-a3cc-6f5eeb458078",
    session_id: "abc",
    source_ip: "127.0.41.132",
    src: "api",
  },
  {
    _timestamp: "2024-12-25T14:26:22.484904Z",
    api_key: "js.123.123",
    chromeVersion: "131",
    click_id: {},
    companyId: 123,
    email: "john.doe@example.com",
    event_type: "workflow-complete",
    eventn_ctx_event_id: "62615da7-a605-420f-9b73-d88ca488fa6d",
    ids: {},
    info: {
      billing: {
        nodeTypeCounts: {
          "click-element": 13,
        },
        ticketDurationsMs: [],
      },
      callCount: 1,
      metrics: {
        actual: {},
      },
      results: [
        {
          callCount: 1,
        },
      ],
      status: "complete",
    },
    jobId: "f3b97b73-15e5-4d5b-af73-43bbbf237b24",
    local_tz_offset: 0,
    manifestVersion: "1.0.0",
    runtimeEnvironment: "production",
    source_ip: "127.0.32.11",
    src: "jitsu",
    teamId: 1,
    timestamp: 1735136772062,
    type: "workflow-complete",
    user: {
      anonymous_id: "",
      hashed_anonymous_id: "bef91c4d78dbf5b10b791d1f483faa9a",
    },
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    utc_time: "2024-12-25T14:26:12.097000Z",
    utm: {},
  },
  {
    _timestamp: "2024-12-25T00:26:56.305721Z",
    api_key: "js.123.123",
    click_id: {
      gclid: "123",
      dclid: "1233",
    },
    doc_encoding: "UTF-8",
    doc_host: "app.example.com",
    doc_path: "/login",
    doc_search: "?next=%2F",
    event_type: "pageview",
    eventn_ctx_event_id: "15fea8d7-14af-4488-92a9-0ae52eba5499",
    ids: {},
    local_tz_offset: 300,
    page_title: "Login - Litnerd",
    referer: "",
    screen_resolution: "1920x1080",
    source_ip: "127.0.56.1",
    src: "jitsu",
    url: "https://app.example.com/login?next=%2F",
    user: {
      anonymous_id: "123",
      hashed_anonymous_id: "49a8381a0fe28827b68a48416dd69a23",
      id: "student:123",
      name: "JOHN DOE",
      role: "student",
      school_id: 123,
    },
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    user_language: "en-US",
    utc_time: "2024-12-25T00:26:56.481000Z",
    utm: {},
    vp_size: "1920x911",
  },
  {
    _timestamp: "2024-12-25T15:33:08.369746Z",
    api_key: "s2s.123.123",
    click_id: {
      gclid: "123",
      dclid: "1233",
    },
    doc_host: "localhost:3000",
    doc_path: "/auth/login",
    doc_search: "",
    event_type: "page_view",
    eventn_ctx_event_id: "98373e80-6228-4163-957e-90703182e9de",
    ids: {
      ga: "GA1.1.123.123",
    },
    isAuthorized: false,
    nextPrefetch: false,
    onVercel: false,
    page_title: "",
    page_url: "http://localhost:3000/auth/login",
    referer: "",
    source_ip: "",
    src: "api",
    url: "http://localhost:3000/auth/login",
    user: {
      anonymous_id: "123",
      hashed_anonymous_id: "ee3cd46ca7a46adb9fa1c9599e64249f",
    },
    user_agent: "Wget/1.21.3",
    utc_time: "2024-12-25T15:33:07.992Z",
    utm: {},
  },
];