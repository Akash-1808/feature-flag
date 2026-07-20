import http from 'k6/http'
import { Trend, Rate } from 'k6/metrics'
import { check, sleep } from 'k6'

const pollingLatency = new Trend('polling_latency_ms');
const pollingEfficiencyRate = new Rate('polling_efficiency_rate');


export const options = {
    stages: [
        { duration: '20s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        // p95 < 50ms for full 200 responses
        'http_req_duration{status:200}': ['p(95)<50'],
        // p95 < 10ms for 304 responses
        'http_req_duration{status:304}': ['p(95)<10'],
        // >95% of polls should return 304
        'polling_efficiency_rate': ['rate>0.95'],
        http_req_failed: ['rate<0.01'],
    },
};

export function setup() {
    const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';
    const apiKey = __ENV.API_KEY || 'ff_server_test_key_123';

    // Seed the ETag by making an initial request
    const res = http.get(`${baseUrl}/sdk/flags`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
    });

    if (res.status !== 200) {
        console.error(`Setup failed: ${res.status} — ${res.body}`);
        return { baseUrl, apiKey, etag: null };
    }

    const etag = res.headers['Etag'] || res.headers['etag'];
    console.log(`Setup complete — ETag: ${etag}`);

    return { baseUrl, apiKey, etag };
}

export default function (data) {
    const url = `${data.baseUrl}/sdk/flags/?environmentId=${data.environmentId}`;
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': data.apiKey,
        },
    };

    // First iteration per VU: fetch without ETag (expect 200)
    // All subsequent iterations: send If-None-Match (expect 304)
    if (__ITER > 0 && data.etag) {
        params.headers['If-None-Match'] = data.etag;
    }

    const res = http.get(`${data.baseUrl}/sdk/flags`, params);

    pollingLatency.add(res.timings.duration);
    pollingEfficiencyRate.add(res.status === 304);

    if (res.status === 200) {
        check(res, {
            'full fetch returns 200': (r) => r.status === 200,
            'full fetch has body': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body?.success === true && body?.data != null;
                } catch {
                    return false;
                }
            },
        });
    } else {
        check(res, {
            'cached poll returns 304': (r) => r.status === 304,
            '304 has no body': (r) => !r.body || r.body.length === 0,
        });
    }

    if (res.status !== 200 && res.status !== 304 && __ITER === 0) {
        console.log(`[k6 debug] Status: ${res.status} | Body: ${res.body}`);
    }

    sleep(1);
}