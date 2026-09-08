-- Legacy usage mart
CREATE OR REPLACE TABLE mart_usage_360 AS
SELECT
  acct_id,
  cycle_cd,
  SUM(CASE WHEN usage_uom = 'MB' THEN usage_qty ELSE 0 END) AS total_mb,
  SUM(CASE WHEN usage_uom = 'MIN' THEN usage_qty ELSE 0 END) AS total_min
FROM bill_usage_evt u
JOIN bill_inv_sum i ON u.acct_id = i.acct_id
GROUP BY 1, 2;
