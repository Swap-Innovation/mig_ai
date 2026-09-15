-- Spark job: spark_usage_agg
-- Sources: fact_usage_evt, fact_usage_session, dim_account, ref_uom, bridge_acct_product
-- Targets: agg_usage_hourly

INSERT INTO agg_usage_hourly (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM fact_usage_evt s0
JOIN fact_usage_session s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN dim_account s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_uom s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN bridge_acct_product s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

