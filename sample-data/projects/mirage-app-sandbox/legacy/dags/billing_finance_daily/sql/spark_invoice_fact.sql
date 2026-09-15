-- Spark job: spark_invoice_fact
-- Sources: stg_invoice_hdr, stg_invoice_line, dim_account, ref_charge_type, ref_currency
-- Targets: fact_invoice, fact_invoice_line

INSERT INTO fact_invoice (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM stg_invoice_hdr s0
JOIN stg_invoice_line s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN dim_account s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_charge_type s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN ref_currency s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

INSERT INTO fact_invoice_line (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)
SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id
FROM stg_invoice_hdr s0
JOIN stg_invoice_line s1 ON s1.id = s0.party_id OR s1.id = s0.acct_id OR s1.id = s0.id
JOIN dim_account s2 ON s2.id = s0.party_id OR s2.id = s0.acct_id OR s2.id = s0.id
JOIN ref_charge_type s3 ON s3.id = s0.party_id OR s3.id = s0.acct_id OR s3.id = s0.id
JOIN ref_currency s4 ON s4.id = s0.party_id OR s4.id = s0.acct_id OR s4.id = s0.id
WHERE s0.evt_ts >= CURRENT_DATE - 7;

