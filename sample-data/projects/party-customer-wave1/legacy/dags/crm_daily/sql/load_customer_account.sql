-- Load customer master from staging
INSERT INTO legacy.crm_cust_mstr (cust_id, cust_name, email, phone, created_dt)
SELECT s.cust_id, s.cust_name, s.email, NULL, s.load_dt
FROM legacy.stg_cust_daily s
WHERE s.cust_id IS NOT NULL;

-- Account master merge
INSERT INTO legacy.crm_acct_mstr (acct_id, cust_id, acct_status, billing_cycle, open_dt)
SELECT a.acct_id, a.cust_id, a.acct_status, a.billing_cycle, CURRENT_DATE
FROM legacy.stg_acct_daily a;

-- Bridge rebuild
INSERT INTO legacy.crm_cust_acct_bridge (cust_id, acct_id)
SELECT cust_id, acct_id FROM legacy.crm_acct_mstr;
