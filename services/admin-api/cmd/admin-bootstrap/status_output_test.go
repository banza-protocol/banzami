package main

import (
	"os"
	"regexp"
	"testing"
)

// The tool must not name a lifecycle state as a literal.
//
// It printed "status=ACTIVE" as fixed text, and went on printing it after the
// row it had just written stopped being ACTIVE — so the one tool an operator
// runs to create the first SUPER_ADMIN reported exactly the thing the lifecycle
// change existed to stop being true.
//
// A state read back from the row cannot drift from the row. A literal always
// can.
func TestBootstrapDoesNotPrintAHardcodedLifecycleState(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	// status=<A CONSTANT>, rather than status=%s
	bad := regexp.MustCompile(`status=(ACTIVE|INVITED|MFA_[A-Z_]+|SUSPENDED)\b`)
	for _, m := range bad.FindAllString(string(src), -1) {
		t.Errorf("main.go prints a hardcoded lifecycle state (%q) — read it back from the row instead", m)
	}
}
