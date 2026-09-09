-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.mart_acct_360
-- SID: Party / CustomerAccount
CREATE TABLE IF NOT EXISTS sid_customeraccount.customeraccount (
  accountid STRING,  -- SID CustomerAccount.accountId
  partyid STRING,  -- SID Party.partyId
  accountid STRING,  -- SID CustomerAccount.accountId
  accountstatus STRING,  -- SID CustomerAccount.accountStatus
  balance NUMERIC,  -- SID CustomerAccount.balance
  usagequantity NUMERIC,  -- SID CustomerUsage.usageQuantity
  interactiondate TIMESTAMP,  -- SID BusinessInteraction.interactionDate
  batchid STRING  -- SID BusinessInteraction.batchId
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns