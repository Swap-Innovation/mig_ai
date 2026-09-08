-- Legacy billing usage load (demo)
INSERT INTO bill_usage_evt (evt_id, acct_id, usage_qty, usage_uom, evt_ts)
SELECT src.evt_id, src.acct_id, src.usage_qty, src.usage_uom, src.evt_ts
FROM staging_usage src
WHERE src.evt_ts >= CURRENT_DATE - 1;
