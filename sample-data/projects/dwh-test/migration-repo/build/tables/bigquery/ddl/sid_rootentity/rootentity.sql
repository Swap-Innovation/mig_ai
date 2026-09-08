-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.fact_risk_score
-- SID: Common / RootEntity
CREATE TABLE IF NOT EXISTS sid_rootentity.rootentity (
  id STRING,  -- SID RootEntity.id
  partyid STRING,  -- SID Party.partyId
  accountid STRING,  -- SID CustomerAccount.accountId
  accountstatus STRING,  -- SID CustomerAccount.accountStatus
  chargeamount NUMERIC,  -- SID CustomerBill.chargeAmount
  usagequantity NUMERIC,  -- SID CustomerUsage.usageQuantity
  interactiondate TIMESTAMP,  -- SID BusinessInteraction.interactionDate
  batchid STRING  -- SID BusinessInteraction.batchId
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns