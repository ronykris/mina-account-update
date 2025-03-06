import dotenv from "dotenv";

dotenv.config()

export const BLOCKBERRY_API_KEY = process.env.BLOCKBERRY_API_KEY || ""
export const BLOCKBERRY_API_BASE = "https://api.blockberry.one/mina-mainnet/v1";