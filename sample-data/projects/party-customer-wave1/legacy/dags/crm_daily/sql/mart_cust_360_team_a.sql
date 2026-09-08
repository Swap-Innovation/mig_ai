-- Unsound truncate-reload pattern for Team A mart
TRUNCATE TABLE marts.dm_cust_360_team_a;
INSERT INTO marts.dm_cust_360_team_a (cust_id, cust_name, email, acct_cnt)
SELECT c.cust_id, c.cust_name, c.email, COUNT(a.acct_id)
FROM legacy.crm_cust_mstr c
LEFT JOIN legacy.crm_acct_mstr a ON c.cust_id = a.cust_id
GROUP BY c.cust_id, c.cust_name, c.email;
