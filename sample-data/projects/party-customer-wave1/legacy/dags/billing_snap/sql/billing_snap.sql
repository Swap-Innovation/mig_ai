-- Nightly billing snapshot from CRM accounts
INSERT INTO legacy.billing_acct_snap (acct_id, cust_id, snap_dt, acct_status)
SELECT a.acct_id, a.cust_id, CURRENT_DATE, a.acct_status
FROM legacy.crm_acct_mstr a
WHERE a.acct_status IN ('ACTIVE', 'SUSPENDED');
