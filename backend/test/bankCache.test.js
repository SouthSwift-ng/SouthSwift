const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const { redis } = require('../config/redis');
const bankCache = require('../utils/bankCache');

const originalAxiosGet = axios.get;
const originalRedis = {
  get: redis.get,
  setEx: redis.setEx,
  del: redis.del,
};

let store;

const useMemoryRedis = () => {
  store = new Map();
  redis.get = async (key) => (store.has(key) ? store.get(key) : null);
  redis.setEx = async (key, seconds, value) => {
    store.set(key, value);
    return 'OK';
  };
  redis.del = async (key) => (store.delete(key) ? 1 : 0);
};

const restoreDependencies = () => {
  axios.get = originalAxiosGet;
  redis.get = originalRedis.get;
  redis.setEx = originalRedis.setEx;
  redis.del = originalRedis.del;
  bankCache.clearBankCacheMemory();
};

test.beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_cache';
  useMemoryRedis();
  bankCache.clearBankCacheMemory();
});

test.afterEach(() => {
  restoreDependencies();
});

const paystackBanks = [
  { name: 'Zenith Bank', code: '057', country: 'Nigeria', active: true },
  { name: 'Access Bank', code: '044', country: 'Nigeria', active: true },
  { name: 'Inactive Bank', code: '999', country: 'Nigeria', active: false },
];

test('bank list is cached after the first Paystack call', async () => {
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    return { data: { data: paystackBanks } };
  };

  const first = await bankCache.getBankList();
  const second = await bankCache.getBankList();

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((b) => b.code), ['044', '057']);
});

test('account resolution is cached for the same bank and account', async () => {
  let calls = 0;
  axios.get = async (url) => {
    calls += 1;
    assert.match(url, /bank\/resolve/);
    return {
      data: {
        data: { account_name: 'JANE DOE', account_number: '0123456789' },
      },
    };
  };

  const first = await bankCache.resolveBankAccount('0123456789', '057');
  const second = await bankCache.resolveBankAccount('0123456789', '057');

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first.account_name, 'JANE DOE');
});

test('a failed resolution is negatively cached and not cached as a name', async () => {
  let calls = 0;
  axios.get = async () => {
    calls += 1;
    const err = new Error('Test mode daily limit exceeded');
    err.response = {
      status: 400,
      data: { message: 'Test mode daily limit of 3 live bank resolves exceeded' },
    };
    throw err;
  };

  await assert.rejects(
    bankCache.resolveBankAccount('0123456789', '058'),
    /Test mode daily limit/
  );
  await assert.rejects(
    bankCache.resolveBankAccount('0123456789', '058'),
    /not retrying yet/
  );

  assert.equal(calls, 1);
  assert.equal(store.has('paystack:resolve:058:0123456789'), false);
});

test('bank list is served from memory when the Redis copy is missing', async () => {
  axios.get = async () => ({ data: { data: paystackBanks } });
  const fresh = await bankCache.getBankList();

  store.clear();
  axios.get = async () => {
    throw new Error('Paystack unavailable');
  };

  const stale = await bankCache.getBankList();
  assert.deepEqual(stale, fresh);
});

test('cache error messages never expose Paystack details', () => {
  assert.doesNotMatch(
    bankCache.BANK_RESOLVE_UNAVAILABLE_MESSAGE,
    /paystack|quota|limit|test mode/i
  );
  assert.doesNotMatch(
    bankCache.BANK_LIST_UNAVAILABLE_MESSAGE,
    /paystack|quota|limit|test mode/i
  );
});
