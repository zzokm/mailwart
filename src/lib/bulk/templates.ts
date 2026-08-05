/** Downloadable mailbox CSV template — quota column required by Phase 3.6. */
export const MAILBOX_TEMPLATE_CSV = `email,password,description,quota
ops@example.com,ChangeMe123!,Operations mailbox,2G
alerts@example.com,ChangeMe123!,Alerts mailbox,500M
billing@example.com,ChangeMe123!,Billing,5G
`

/** Downloadable forwarding CSV template. */
export const FORWARDING_TEMPLATE_CSV = `source,targets,keep_local,enabled
alice@example.com,bob@example.com;carol@example.com,true,true
*@example.com,catch@example.com,false,true
`

export const MAILBOX_TEMPLATE_FILENAME = "template.csv"
export const FORWARDING_TEMPLATE_FILENAME = "forwarding-template.csv"
