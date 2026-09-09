-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.fact_usage_session
-- SID: Customer / CustomerUsage
CREATE TABLE IF NOT EXISTS sid_customerusage.customerusage (
  id STRING,  -- SID CustomerUsage.id
  partyid STRING,  -- SID Party.partyId
  accountid STRING,  -- SID CustomerAccount.accountId
  status STRING,  -- SID CustomerUsage.status
  usageamount NUMERIC,  -- SID CustomerUsage.usageAmount
  usagequantity NUMERIC,  -- SID CustomerUsage.usageQuantity
  usagedate TIMESTAMP,  -- SID CustomerUsage.usageDate
  batchid STRING  -- SID BusinessInteraction.batchId
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns