import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const evaluateLatency = new Trend('evaluate_latency_ms');
const errorRate = new Rate('error_rate');

export const options = {
    stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.01'],
    }
}

export function setup() {
    return {
        apiKey: __ENV.API_KEY || 'ff_server_test_key_123',
        baseUrl: __ENV.BASE_URL || 'http://localhost:3001',
        environmentId: __ENV.ENV_ID || 'env_dev_123',
    };
}

export default function (data) {
    const url = `${data.baseUrl}/sdk/evaluate`;

    const payload = JSON.stringify({
        flagKey: 'test-flag-1',
        userId: `user-${__VU}-${__ITER}`,
        attributes: {
            country: 'US',
            plan: 'pro',
        }
    });

    const params = {
        headers: {
            'Content-type': 'application/json',
            'x-api-key': data.apiKey,
        }
    }

    const res = http.post(url, payload, params);

    if (res.status !== 200 && __ITER === 0) {
        console.log(`[k6 debug] Status: ${res.status} | Body: ${res.body}`);
    }

    evaluateLatency.add(res.timings.duration)
    errorRate.add(res.status !== 200);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'has evaluation result': (r) => {
            try {
                const body = JSON.parse(r.body);
                return typeof body?.data?.enabled === 'boolean';
            } catch {
                return false;
            }
        }
    });

    sleep(0.1);
}