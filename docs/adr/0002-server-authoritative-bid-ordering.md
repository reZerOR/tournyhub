# Use server-authoritative Bid ordering

When competing Bids arrive for the same price, the server accepts the first valid Bid in the order it receives them and rejects the others. Client clocks and screen timing do not decide winners because network delay and clock differences would make results inconsistent and open to manipulation.
