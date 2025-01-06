import axios from "axios";

/**
 * Fetch token data from Pump API.
 * @param mintStr - The mint address of the token.
 * @returns Token data including bonding curve and fee information.
 */
export async function getCoinData(mintStr: string) {
  try {
    const url = `https://frontend-api.pump.fun/coins/${mintStr}`;
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.pump.fun/",
        Origin: "https://www.pump.fun",
        Connection: "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      },
    });

    if (response.status === 200) {
    //   console.log("Coin data retrieved successfully:", response.data);
      return response.data;
    } else {
      console.error("Failed to retrieve coin data:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching coin data:", error?.message);
    return null;
  }
}
