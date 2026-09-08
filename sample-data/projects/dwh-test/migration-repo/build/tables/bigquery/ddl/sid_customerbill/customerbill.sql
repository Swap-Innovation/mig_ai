-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.mart_finance_360
-- SID: Customer / CustomerBill
CREATE TABLE IF NOT EXISTS sid_customerbill.customerbill (
  id STRING,  -- SID CustomerBill.id
  partyid STRING,  -- SID Party.partyId
  accountid STRING,  -- SID CustomerAccount.accountId
  status STRING,  -- SID CustomerBill.status
  chargeamount NUMERIC,  -- SID CustomerBill.chargeAmount
  usagequantity NUMERIC,  -- SID CustomerUsage.usageQuantity
  interactiondate TIMESTAMP,  -- SID BusinessInteraction.interactionDate
  batchid STRING  -- SID BusinessInteraction.batchId
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns