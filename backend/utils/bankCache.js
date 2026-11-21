const axios = require('axios');
const { redis } = require('../config/redis');

const LIST_KEY = 'paystack:banks:NGN';
const LIST_STALE_KEY = 'paystack:banks:NGN:stale';
const RESOLVE_KEY = (bankCode, accountNumber) =>
  `paystack:resolve:${bankCode}:${accountNumber}`;

const BANK_LIST_UNAVAILABLE_MESSAGE =
  'Bank list is temporarily unavailable. Please try again shortly.';
const BANK_RESOLVE_UNAVAILABLE_MESSAGE =
  "We couldn't verify this bank account right now. Please confirm the bank and account number and try again.";

const intEnv = (name, fallback) => {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const listTtlSeconds = () =>
  intEnv('BANK_LIST_CACHE_TTL_SECONDS', 7 * 24 * 60 * 60);
const resolveTtlSeconds = () =>
  intEnv('BANK_RESOLVE_CACHE_TTL_SECONDS', 7 * 24 * 60 * 60);
const failureTtlSeconds = () =>
  intEnv('BANK_RESOLVE_FAILURE_TTL_SECONDS', 10 * 60);

let memoryBankList = null;

const maskAccountNumber = (accountNumber) =>
  String(accountNumber || '').replace(/.(?=.{4})/g, '*');

const parseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const fetchPaystackBanks = async () => {
  if (!process.env.PAYSTACK_SECRET_KEY)
    throw new Error('PAYSTACK_SECRET_KEY is not configured.');

  const response = await axios.get(
    'https://api.paystack.co/bank?country=nigeria&currency=NGN',
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      timeout: 10000,
    }
  );

  const seen = new Set();
  const banks = (response.data?.data || [])
    .filter(
      (bank) =>
        bank &&
        bank.name &&
        bank.code &&
        bank.active !== false &&
        (!bank.country || String(bank.country).toLowerCase() === 'nigeria')
    )
    .map((bank) => ({ name: bank.name, code: String(bank.code) }))
    .filter((bank) => {
      if (seen.has(bank.code)) return false;
      seen.add(bank.code);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!banks.length) throw new Error('Paystack returned an empty bank list.');
  return banks;
};

const getBankList = async () => {
  const cached = parseJson(await redis.get(LIST_KEY));
  if (Array.isArray(cached) && cached.length) return cached;

  if (
    memoryBankList &&
    Date.now() - memoryBankList.at < listTtlSeconds() * 1000
  ) {
    return memoryBankList.banks;
  }

  try {
    const banks = await fetchPaystackBanks();
    memoryBankList = { banks, at: Date.now() };
    await redis.setEx(LIST_KEY, listTtlSeconds(), JSON.stringify(banks));
    await redis.setEx(LIST_STALE_KEY, 30 * 24 * 60 * 60, JSON.stringify(banks));
    return banks;
  } catch (err) {
    console.error(
      'Paystack bank list fetch failed:',
      err.response?.status || '',
      err.response?.data?.message || err.message
    );

    const stale = parseJson(await redis.get(LIST_STALE_KEY));
    if (Array.isArray(stale) && stale.length) return stale;
    if (memoryBankList?.banks?.length) return memoryBankList.banks;
    throw err;
  }
};

const resolveBankAccount = async (accountNumber, bankCode) => {
  const account = String(accountNumber);
  const bank = String(bankCode);
  const key = RESOLVE_KEY(bank, account);
  const failureKey = `${key}:failure`;

  const cached = parseJson(await redis.get(key));
  if (cached?.account_name) return cached;

  if (await redis.get(failureKey)) {
    throw new Error('Paystack account resolve recently failed; not retrying yet.');
  }

  try {
    if (!process.env.PAYSTACK_SECRET_KEY)
      throw new Error('PAYSTACK_SECRET_KEY is not configured.');

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account)}&bank_code=${encodeURIComponent(bank)}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        timeout: 10000,
      }
    );

    const data = response.data?.data;
    if (!data?.account_name)
      throw new Error('Paystack returned no account name for this account.');

    const resolved = {
      account_name: data.account_name,
      account_number: data.account_number || account,
    };
    await redis.setEx(key, resolveTtlSeconds(), JSON.stringify(resolved));
    await redis.del(failureKey);
    return resolved;
  } catch (err) {
    const message =
      err.response?.data?.message || err.message || 'Unknown Paystack error';
    console.error('Paystack bank resolve failed:', {
      bank_code: bank,
      account_number: maskAccountNumber(account),
      status: err.response?.status,
      message,
    });
    await redis.setEx(failureKey, failureTtlSeconds(), '1');
    throw new Error(message);
  }
};

const clearBankCacheMemory = () => {
  memoryBankList = null;
};

module.exports = {
  getBankList,
  resolveBankAccount,
  clearBankCacheMemory,
  BANK_LIST_UNAVAILABLE_MESSAGE,
  BANK_RESOLVE_UNAVAILABLE_MESSAGE,
};
