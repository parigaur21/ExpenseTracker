/**
 * Unit tests for currency service
 */
import { fetchRate } from '../currency';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchRate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 1 when from and to currencies are the same', async () => {
    const rate = await fetchRate('USD', 'USD');
    expect(rate).toBe(1);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('fetches and returns the exchange rate from API', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { rates: { INR: 83.5 } },
    });

    const rate = await fetchRate('USD', 'INR');
    expect(rate).toBe(83.5);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('caches rates for the same day', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { rates: { EUR: 0.92 } },
    });

    // First call hits API
    const rate1 = await fetchRate('USD', 'EUR');
    expect(rate1).toBe(0.92);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const rate2 = await fetchRate('USD', 'EUR');
    expect(rate2).toBe(0.92);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1); // still 1
  });

  it('returns 1 as fallback when API fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    // Use a unique pair to avoid cache from previous tests
    const rate = await fetchRate('GBP', 'JPY');
    expect(rate).toBe(1);
  });

  it('returns 1 when API response has no rate for target currency', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { rates: {} },
    });

    const rate = await fetchRate('AUD', 'CHF');
    expect(rate).toBe(1);
  });
});
