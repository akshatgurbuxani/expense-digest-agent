import { makeInMemoryRepositories } from "../in-memory-repos.js";
import {
  mailAccountRepositoryContract,
  mailMessageRepositoryContract,
  receiptRepositoryContract,
  transactionReceiptLinkRepositoryContract,
} from "./mail-repositories.contract.js";

const makeRepos = () => makeInMemoryRepositories();

mailAccountRepositoryContract(() => makeRepos().mailAccounts, "InMemory");
mailMessageRepositoryContract(() => makeRepos().mailMessages, "InMemory");
receiptRepositoryContract(() => makeRepos().receipts, "InMemory");
transactionReceiptLinkRepositoryContract(
  () => makeRepos().transactionReceiptLinks,
  "InMemory",
);
