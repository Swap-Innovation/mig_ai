-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.dim_party_addr
-- SID: Party / Party
CREATE TABLE IF NOT EXISTS sid_party.party (
  partyid STRING,  -- SID Party.partyId
  partyid STRING,  -- SID Party.partyId
  accountid STRING,  -- SID CustomerAccount.accountId
  status STRING,  -- SID Party.status
  chargeamount NUMERIC,  -- SID CustomerBill.chargeAmount
  usagequantity NUMERIC,  -- SID CustomerUsage.usageQuantity
  interactiondate TIMESTAMP,  -- SID BusinessInteraction.interactionDate
  batchid STRING  -- SID BusinessInteraction.batchId
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns