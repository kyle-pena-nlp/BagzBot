
// TODO: re-org this into a class, and have callbacks for different lifecycle elements.

/*
    Some thoughts:
        DONE - Implement retries.
        Split up into smaller methods and interleave code for handling stuff.
        Optimistically add positions and rollback if transaction is not confirmed.

*/

// TODO: careful analysis of failure modes and their mitigations
// TODO: https://solanacookbook.com/guides/retrying-transactions.html#how-rpc-nodes-broadcast-transactions
// specifically: https://solanacookbook.com/guides/retrying-transactions.html#customizing-rebroadcast-logic 
// https://github.com/solana-labs/solana-program-library/blob/ea354ab358021aa08f774e2d4028b33ec56d4180/token/program/src/error.rs#L16
