-- Oracle Database → BigQuery · disposition=migrate
-- Source: legacy.device_msisdn_map
-- SID: Resource / LogicalResource
CREATE TABLE IF NOT EXISTS sid_logicalresource.logicalresource (
  resourceid STRING,  -- SID LogicalResource.resourceId
  partyid STRING,  -- SID Party.partyId
  device_id STRING
);
-- Consider: PARTITION BY / CLUSTER BY based on access patterns