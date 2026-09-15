-- Spark job: spark_account_dim
-- Sources: stg_acct_raw, stg_acct_status, ref_acct_type, ref_brand, dim_party
-- Targets: dim_account, dim_account_status

INSERT INTO dim_account (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM stg_acct_raw s0
JOIN stg_acct_status s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN ref_acct_type s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_brand s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN dim_party s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

INSERT INTO dim_account_status (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM stg_acct_raw s0
JOIN stg_acct_status s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN ref_acct_type s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_brand s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN dim_party s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

