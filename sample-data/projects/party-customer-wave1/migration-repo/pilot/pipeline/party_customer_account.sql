-- Party & Customer Account source-aligned product (SCD2)
WITH src AS (
  SELECT
    c.cust_id AS party_id,
    c.cust_name AS party_name,
    c.email AS email_address,
    a.acct_id AS account_id,
    a.acct_status AS account_status,
    a.billing_cycle,
    CURRENT_TIMESTAMP AS valid_from,
    CAST(NULL AS TIMESTAMP) AS valid_to,
    TRUE AS is_current
  FROM landing.crm_cust_mstr c
  JOIN landing.crm_acct_mstr a ON c.cust_id = a.cust_id
)
MERGE INTO dp_party_customer_account t
USING src s
ON t.party_id = s.party_id AND t.account_id = s.account_id AND t.is_current
WHEN MATCHED AND (
  t.party_name IS DISTINCT FROM s.party_name
  OR t.account_status IS DISTINCT FROM s.account_status
) THEN UPDATE SET is_current = FALSE, valid_to = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN INSERT (
  party_id, party_name, email_address, account_id, account_status,
  billing_cycle, valid_from, valid_to, is_current
) VALUES (
  s.party_id, s.party_name, s.email_address, s.account_id, s.account_status,
  s.billing_cycle, s.valid_from, s.valid_to, s.is_current
);
