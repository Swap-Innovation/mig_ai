SELECT COUNT(*) = 0 AS orphan_accounts
FROM dp_party_customer_account p
LEFT JOIN landing.crm_cust_mstr c ON p.party_id = c.cust_id
WHERE c.cust_id IS NULL AND p.is_current;
