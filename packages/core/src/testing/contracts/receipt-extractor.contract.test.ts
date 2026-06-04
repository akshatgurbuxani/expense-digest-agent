import { makeFakeReceiptExtractor } from "../fake-receipt-extractor.js";
import { receiptExtractorContract } from "./receipt-extractor.contract.js";

receiptExtractorContract(() => makeFakeReceiptExtractor(), "FakeReceiptExtractor");
