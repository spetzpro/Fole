import { getLogger, setGlobalLogLevel } from "../../src/core/foundation/Logger";

function runLoggerTests(): void {
	// Basic smoke test: logger methods should not throw.
	const logger = getLogger("test.scope");

	setGlobalLogLevel("debug");

	logger.debug("debug message", { a: 1 });
	logger.info("info message");
	logger.warn("warn message");
	logger.error("error message", { err: true });

	// Level filtering: when set to warn, debug/info should be filtered.
	setGlobalLogLevel("warn");

	logger.debug("should be filtered");
	logger.info("should be filtered");
	logger.warn("should be logged");
	logger.error("should be logged");
}

runLoggerTests();
