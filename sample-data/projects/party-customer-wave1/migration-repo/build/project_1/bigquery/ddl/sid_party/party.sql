-- Oracle Database → BigQuery · disposition=rebuild
-- Source: marts.dm_cust_360_team_a
-- SID: Party / Party
CREATE TABLE IF NOT EXISTS sid_party.party (
  partyid STRING,  -- SID Party.partyId
  partyname STRING,  -- SID Party.partyName
  emailaddress STRING,  -- SID Party.emailAddress
  acct_cnt INT64
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns