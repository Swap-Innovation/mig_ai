-- Spark job: spark_party_id_bridge
-- Sources: dim_party, stg_party_id_map, ref_id_type, stg_party_hist, audit_batch
-- Targets: bridge_party_id

INSERT INTO bridge_party_id (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM dim_party s0
JOIN stg_party_id_map s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN ref_id_type s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN stg_party_hist s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN audit_batch s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

