-- Spark job: spark_acct_product
-- Sources: dim_account, stg_prod_hold, ref_product, ref_prod_family
-- Targets: bridge_acct_product

INSERT INTO bridge_acct_product (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM dim_account s0
JOIN stg_prod_hold s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN ref_product s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_prod_family s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

