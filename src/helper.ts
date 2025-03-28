import axios from "axios";
import dotenv from "dotenv";
import {
  BLOCKBERRY_API_BASE,
  BLOCKBERRY_API_KEY,
  BLOCKBERRY_API_BASE_DEVNET,
} from "./config.js";
import { Transaction } from "o1js";

export const fetchZkAppTransactionByHash = async (
  txHash: string,
  network: "mainnet" | "devnet" = "mainnet"
): Promise<any | null> => {
  try {
    const apiBase =
      network === "mainnet" ? BLOCKBERRY_API_BASE : BLOCKBERRY_API_BASE_DEVNET;
    const response = await axios.get(`${apiBase}/zkapps/txs/${txHash}`, {
      headers: {
        Accept: "application/json",
        "x-api-key": BLOCKBERRY_API_KEY,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Error fetching zkApp transaction ${txHash}: ${error.message}`,
        error.response?.data
      );
    } else {
      console.error(
        `Error fetching zkApp transaction ${txHash}: ${
          (error as Error).message
        }`
      );
    }
    return null;
  }
};
