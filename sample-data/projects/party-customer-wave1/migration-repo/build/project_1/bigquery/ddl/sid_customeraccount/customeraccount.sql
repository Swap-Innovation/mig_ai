-- Oracle Database → BigQuery · disposition=migrate
-- Source: marts.dm_billing_cust_snap
-- SID: Party / CustomerAccount
CREATE TABLE IF NOT EXISTS sid_customeraccount.customeraccount (
  accountid STRING,  -- SID CustomerAccount.accountId
  partyid STRING,  -- SID Party.partyId
  balance NUMERIC,
  snap_dt DATE
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns