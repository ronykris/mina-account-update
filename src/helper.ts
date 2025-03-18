import axios from "axios";
import dotenv from 'dotenv'
import { BLOCKBERRY_API_BASE, BLOCKBERRY_API_KEY } from "./config.js";
import { Transaction } from "o1js";

export const fetchZkAppTransactionByHash = async (txHash: string): Promise<any | null> => {
    try {
        const response = await axios.get(
            `${BLOCKBERRY_API_BASE}/zkapps/txs/${txHash}`,
            {
                headers: {
                    "Accept": "application/json",
                    "x-api-key": BLOCKBERRY_API_KEY
                }
            }
        );    
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error fetching zkApp transaction ${txHash}: ${error.message}`, error.response?.data);
        } else {
            console.error(`Error fetching zkApp transaction ${txHash}: ${(error as Error).message}`);
        }
        return null;
    }
}