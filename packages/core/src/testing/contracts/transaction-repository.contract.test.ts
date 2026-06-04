import { transactionRepositoryContract } from "./transaction-repository.contract.js";
import { makeInMemoryRepositories } from "../in-memory-repos.js";

transactionRepositoryContract(
  () => makeInMemoryRepositories().transactions,
  "InMemory",
);
