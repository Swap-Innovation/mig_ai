SELECT
  (SELECT COUNT(DISTINCT cust_id||':'||acct_id) FROM legacy.crm_cust_acct_bridge) AS legacy_keys,
  (SELECT COUNT(*) FROM dp_party_customer_account WHERE is_current) AS product_keys;
