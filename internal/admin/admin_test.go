package admin

import "testing"

func TestRoleAllows(t *testing.T) {
	cases := []struct {
		role, minimum Role
		want          bool
	}{
		{RoleSuperAdmin, RoleSupport, true},
		{RoleSupport, RoleSupport, true},
		{RoleReadOnly, RoleSupport, false},
		{RoleSupport, RoleSuperAdmin, false},
		{Role("owner"), RoleReadOnly, false},
	}
	for _, c := range cases {
		if got := c.role.Allows(c.minimum); got != c.want {
			t.Errorf("%s.Allows(%s) = %v, want %v", c.role, c.minimum, got, c.want)
		}
	}
}

func TestSearchPatternEscapesWildcards(t *testing.T) {
	if got := searchPattern(` 50%_off\ `); got != `%50\%\_off\\%` {
		t.Fatalf("searchPattern = %q", got)
	}
}

func TestPageNormalize(t *testing.T) {
	p := Page{Number: 0, Size: 500}.normalize()
	if p.Number != 1 || p.Size != 25 || p.offset() != 0 {
		t.Fatalf("normalize = %+v", p)
	}
	if got := (Page{Number: 3, Size: 10}).normalize().offset(); got != 20 {
		t.Fatalf("offset = %d", got)
	}
}

func TestActivityDays(t *testing.T) {
	for in, want := range map[int]int{0: 30, 6: 30, 7: 7, 90: 90, 500: 180} {
		if got := ActivityDays(in); got != want {
			t.Errorf("ActivityDays(%d) = %d, want %d", in, got, want)
		}
	}
}
