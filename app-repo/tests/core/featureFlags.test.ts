import {
	initFeatureFlags,
	getFeatureFlags,
	setFeatureFlagOverrides,
	clearFeatureFlagOverrides,
} from "../../src/core/foundation/FeatureFlags";

function runFeatureFlagsTests(): void {
	initFeatureFlags({
		defaults: {
			"feature.a": true,
			"feature.b": false,
		},
	});

	const flags = getFeatureFlags();

	// Defaults
	if (!flags.isEnabled("feature.a")) {
		throw new Error("feature.a should be enabled by default");
	}
	if (flags.isEnabled("feature.b")) {
		throw new Error("feature.b should be disabled by default");
	}
	if (flags.isEnabled("feature.unknown")) {
		throw new Error("Unknown feature flag should default to false");
	}

	// Overrides
	setFeatureFlagOverrides({
		"feature.a": false,
		"feature.c": true,
	});

	if (flags.isEnabled("feature.a")) {
		throw new Error("feature.a should be disabled via override");
	}
	if (!flags.isEnabled("feature.c")) {
		throw new Error("feature.c should be enabled via override");
	}

	const snapshot = flags.getSnapshot();
	if (!snapshot.values["feature.c"]) {
		throw new Error("Snapshot should include override for feature.c");
	}

	clearFeatureFlagOverrides();
	if (!flags.isEnabled("feature.a")) {
		throw new Error(
			"feature.a should revert to default after clearing overrides",
		);
	}
}

runFeatureFlagsTests();
