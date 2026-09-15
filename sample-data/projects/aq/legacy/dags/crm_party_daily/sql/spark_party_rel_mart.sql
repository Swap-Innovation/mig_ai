-- Spark job: spark_party_rel_mart
-- Sources: dim_party, dim_party_addr, bridge_party_id, stg_party_rel, ref_rel_type
-- Targets: fact_party_rel, mart_party_360

INSERT INTO fact_party_rel (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM dim_party s0
JOIN dim_party_addr s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN bridge_party_id s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN stg_party_rel s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN ref_rel_type s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

INSERT INTO mart_party_360 (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM dim_party s0
JOIN dim_party_addr s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN bridge_party_id s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN stg_party_rel s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN ref_rel_type s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

