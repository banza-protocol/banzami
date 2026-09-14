# Wallet-native terminology

Version: 1.0

The canonical meaning of the words ADR-061 depends on. When code, documentation,
the website, the Console or a strategy document uses one of these words, it means
this. A different meaning needs a different word.

| Term | Means | Does not mean |
|---|---|---|
| **Wallet** | A participant's financial position in the Banzami network — a consumer's, a Business's — derived from ledger postings. | A stored balance; a card; a bank account. |
| **Wallet Account** | An authorised, segregated destination inside a wallet (a campaign, a store, a Project's default account), backed by its own ledger account and owned by the wallet's participant. | A second ledger; an account the integrator owns; an external bank account. |
| **Wallet-native** | Wallet state is a fundamental financial primitive: every participant has a wallet, and payments are movements between wallets. | "Has a wallet feature" on top of a gateway. |
| **Ledger-native** | Canonical financial state is Core plus the ledger plus explicit reconciliation state; a balance is derived from postings. | Whatever a provider last reported. |
| **Internal financial movement** | A balanced double-entry posting between accounts inside the network, written by Banzami Core: P2P, a wallet payment to a Business, a refund of a wallet payment, an application settlement, a wallet account transfer. | Anything that needs an external rail to exist. |
| **External rail** | A system outside the network through which value enters, leaves or settles: banks, EMIS, PSPs, clearing and settlement systems. Reached only through an adapter (`core/acquiring/src/providers`, payouts). | The execution substrate of internal movements. |
| **Rail-decoupled** | An internal movement does not technically require an external rail; a rail outage is not an accidental dependency of the ledger. | Rail-free; independent of banks or EMIS; exempt from regulation. |
| **Rail-dependent operation** | An operation that crosses an external rail and declares it: hosted acquiring payment, cash-in, cash-out, payout, external settlement. Fails closed when the rail is unavailable. | A wallet payment with an external-sounding name. |
| **Cash-in (funding)** | Value entering the network: external value → external rail → confirmed and reconciled → network value. In Live, never credited without real external confirmation. | A Sandbox test payer's top-up, which is fictitious value created by Core. |
| **Cash-out (withdrawal)** | Value leaving the network: authorised instruction → reservation/posting → external rail → external destination; complete only on the rail's confirmation. | Deleting a balance. |
| **P2P** | A consumer-to-consumer internal movement through the consumer surface (`/v1/transfers`, consumer authentication). | A merchant payment; a developer API. |
| **Business payment** | A payer's wallet → Core → the Business's wallet account, through a Payment Session, Payment Link or QR. | Consumer → provider → merchant bank account. |
| **Payment Session** | An orchestration primitive: application intent → payer interaction → an authorised movement in Core → canonical result → webhook, realtime, receipt. | A financial authority. |
| **Settlement** | Internal allocation of value already in the network between accounts according to pricing (gross = fee + net). | Moving money to a bank. |
| **Application Settlement** | The settlement of an APPLICATION Business's collected value into its own accounts and fee destination (ADR-028/029). Internal. | External banking settlement. |
| **External settlement** | Movement of value between the network and an external institution through a rail. Rail-dependent; not available (Financial Live). | Application Settlement. |
| **Reconciliation** | Comparing internal ledger truth with external evidence (provider reports, bank statements) and reporting mismatches. Corrections are new balanced postings. | Editing the ledger to match a provider. |
| **Simulated external rail** | The Sandbox's stand-in for an external rail, per Project and Business (`PUT /v1/sandbox/external-rail`): it reaches that Project's test payments and the hosted payments of what it created, never another Project's. | Real infrastructure; Financial Live; a switch over anyone else's integration. |
| **Financial Live** | The future regulated real-money environment. Currently NOT READY / FAIL-CLOSED, subject to the applicable regulatory, contractual and operational approvals. | Production of the developer platform; a publicly deployed application running on the Sandbox. |
| **Public Sandbox** | The fictitious-value financial environment of the same platform: the executable model of the network. | A copy of Live; evidence of regulatory approval. |
| **@banza** | Banzami-native participant addressing: a handle that resolves to a Banzami participant or resource under namespace and authorisation rules. | An alias for an external bank account; the BANZA protocol. |
