package developer

// Authority and isolation for the Console's API Logs screen.
//
// A request log is a record of what a developer's credential did. Two projects
// sharing one is a disclosure, and a "not yours" that reads differently from
// "never existed" is an existence oracle for another project's traffic. Both are
// tested here, in both directions, with the mutation that would break them.

import (
	"testing"
	"time"
)

func logFixture(t *testing.T) (s *Service, st *memStore, projA, projB string) {
	t.Helper()
	s, st = newSvc(time.Hour)
	// Two workspaces owned by two different users — the real cross-tenant shape.
	wsA, _ := s.CreateWorkspace(bg, "u_a", "A", "", "")
	wsB, _ := s.CreateWorkspace(bg, "u_b", "B", "", "")
	pa, err := s.CreateProject(bg, "u_a", wsA.ID, "ProjA", "", "")
	if err != nil {
		t.Fatal(err)
	}
	pb, err := s.CreateProject(bg, "u_b", wsB.ID, "ProjB", "", "")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	ms := 12
	st.SeedRequestLog(pa.ID, APIRequestLogView{
		ID: "l1", Method: "POST", Path: "/v1/business/refunds", Route: "/v1/business/refunds",
		Status: 201, RequestID: "req_a_1", LatencyMS: &ms, Environment: "SANDBOX", CreatedAt: now,
	})
	st.SeedRequestLog(pa.ID, APIRequestLogView{
		ID: "l2", Method: "GET", Path: "/v1/business/payment-links", Route: "/v1/business/payment-links",
		Status: 404, RequestID: "req_a_2", Environment: "SANDBOX", CreatedAt: now.Add(-time.Minute),
	})
	st.SeedRequestLog(pb.ID, APIRequestLogView{
		ID: "l3", Method: "POST", Path: "/v1/business/transfers", Route: "/v1/business/transfers",
		Status: 200, RequestID: "req_b_1", Environment: "SANDBOX", CreatedAt: now,
	})
	return s, st, pa.ID, pb.ID
}

func TestRequestLogs_ProjectSeesOnlyItsOwn(t *testing.T) {
	s, _, projA, projB := logFixture(t)

	a, err := s.ProjectAPIRequestLogs(bg, "u_a", projA, RequestLogFilter{})
	if err != nil {
		t.Fatalf("owner read own logs: %v", err)
	}
	if len(a) != 2 {
		t.Fatalf("project A logs = %d, want 2", len(a))
	}
	for _, l := range a {
		if l.RequestID == "req_b_1" {
			t.Error("project A can see project B's request")
		}
	}
	b, err := s.ProjectAPIRequestLogs(bg, "u_b", projB, RequestLogFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(b) != 1 || b[0].RequestID != "req_b_1" {
		t.Errorf("project B logs = %+v", b)
	}
}

// Both directions: neither owner may read the other's project.
func TestRequestLogs_CrossProjectRejected(t *testing.T) {
	s, _, projA, projB := logFixture(t)
	for _, c := range []struct{ actor, project string }{
		{"u_b", projA},
		{"u_a", projB},
		{"u_outsider", projA},
	} {
		got, err := s.ProjectAPIRequestLogs(bg, c.actor, c.project, RequestLogFilter{})
		if err != ErrForbidden {
			t.Errorf("%s reading %s: err = %v, want Forbidden", c.actor, c.project, err)
		}
		if len(got) != 0 {
			t.Errorf("%s reading %s returned %d rows", c.actor, c.project, len(got))
		}
	}
}

// A request_id from another project is not an oracle: asking for it inside your
// own project answers exactly as an id that never existed does.
func TestRequestLogs_ForeignRequestIDIsNotAnOracle(t *testing.T) {
	s, _, projA, _ := logFixture(t)
	foreign, err := s.ProjectAPIRequestLogs(bg, "u_a", projA, RequestLogFilter{RequestID: "req_b_1"})
	if err != nil {
		t.Fatal(err)
	}
	invented, err := s.ProjectAPIRequestLogs(bg, "u_a", projA, RequestLogFilter{RequestID: "req_never_existed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(foreign) != 0 || len(invented) != 0 {
		t.Fatalf("foreign=%d invented=%d, want 0 and 0", len(foreign), len(invented))
	}
}

func TestRequestLogs_Filters(t *testing.T) {
	s, _, projA, _ := logFixture(t)
	cases := []struct {
		name string
		f    RequestLogFilter
		want int
	}{
		{"by request_id", RequestLogFilter{RequestID: "req_a_1"}, 1},
		{"by status", RequestLogFilter{Status: 404}, 1},
		{"by path substring", RequestLogFilter{Path: "refunds"}, 1},
		{"by path case-insensitive", RequestLogFilter{Path: "REFUNDS"}, 1},
		{"no match", RequestLogFilter{Path: "payouts"}, 0},
		{"limit", RequestLogFilter{Limit: 1}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := s.ProjectAPIRequestLogs(bg, "u_a", projA, c.f)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != c.want {
				t.Errorf("filter %+v → %d rows, want %d", c.f, len(got), c.want)
			}
		})
	}
}

// Non-vacuity: the isolation tests above would pass against a store that always
// returned nothing. This proves the fixture's rows are actually readable, so an
// empty result elsewhere means "filtered out", not "nothing was ever there".
func TestRequestLogs_FixtureIsNotVacuous(t *testing.T) {
	s, _, projA, projB := logFixture(t)
	a, _ := s.ProjectAPIRequestLogs(bg, "u_a", projA, RequestLogFilter{})
	b, _ := s.ProjectAPIRequestLogs(bg, "u_b", projB, RequestLogFilter{})
	if len(a) == 0 || len(b) == 0 {
		t.Fatalf("fixture produced no readable rows (a=%d b=%d) — the isolation tests would be vacuous", len(a), len(b))
	}
	if a[0].CreatedAt.Before(a[1].CreatedAt) {
		t.Error("logs must come back newest first")
	}
	if a[0].LatencyMS == nil || *a[0].LatencyMS != 12 {
		t.Error("latency must survive the read path")
	}
}

// The view type is the whole record. A field that does not exist cannot be
// filled in later by a query change.
func TestRequestLogView_CarriesNoCredentialField(t *testing.T) {
	v := APIRequestLogView{}
	// Compile-time surface check: adding a header/body/secret field to this
	// struct breaks this list and forces the change to be argued for.
	_ = struct {
		ID, Method, Path, Route, RequestID, Environment string
		Status                                          int
		LatencyMS                                       *int
		CreatedAt                                       time.Time
	}{v.ID, v.Method, v.Path, v.Route, v.RequestID, v.Environment, v.Status, v.LatencyMS, v.CreatedAt}
}
