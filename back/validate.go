package main

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/naive-encryption/predictions/contract"
)

var slug = regexp.MustCompile("^[a-z0-9][a-z0-9-_]*$")

func validateTournament(t contract.TournamentInput, knownTeams []string) []string {
	errs := make([]string, 0, 64)
	if !slug.MatchString(t.ID) {
		errs = append(errs, "Tournament id must be a lowercase slug")
	}
	if strings.TrimSpace(t.Name) == "" {
		errs = append(errs, "Tournament name must not be empty")
	}
	if t.EndsAt.Before(t.StartsAt) {
		errs = append(errs, "Invalid tournament dates")
	}
	for _, duplicate := range findDulpicate(t.TeamIDs) {
		errs = append(errs, fmt.Sprintf("Team %q is listed twice", duplicate))
	}
	for _, id := range t.TeamIDs {
		if !slices.Contains(knownTeams, id) {
			errs = append(errs, fmt.Sprintf("Unknown team %q. Create it under team first", id))
		}
	}

	phaseIDs := make([]string, 0, len(t.Phases))
	for _, phase := range t.Phases {
		phaseIDs = append(phaseIDs, phase.ID)
	}
	for _, duplicate := range findDulpicate(phaseIDs) {
		errs = append(errs, fmt.Sprintf("Phase id %q used twice", duplicate))
	}

	for _, phase := range t.Phases {
		at := phase.Name + ": "
		if !slug.MatchString(phase.ID) {
			errs = append(errs, "Phase id must be a lowercase slug")
		}
		switch phase.Kind {
		case "groups":
			errs = append(errs, validateGroups(&t, phase, at, knownTeams)...)
		case "bracket":
			errs = append(errs, validateBrackets(&t, phase, at, knownTeams)...)
		default:
			errs = append(errs, at+"Tournament kind must be 'groups' or 'bracket' ")
		}
	}

	return errs
}

func validateGroups(t *contract.TournamentInput, phase contract.Phase, at string, knownTeams []string) []string {
	errs := make([]string, 0, 32)
	groupIDs := make([]string, 0, len(phase.Groups))
	for _, group := range phase.Groups {

		groupIDs = append(groupIDs, group.ID)
		for _, duplicate := range findDulpicate(group.TeamIDs) {
			errs = append(errs, fmt.Sprintf(at+"Team %q is listed twice", duplicate))
		}

		for _, id := range group.TeamIDs {
			if !slices.Contains(knownTeams, id) {
				errs = append(errs, fmt.Sprintf(at+"Unknown team %q. Create it under team first", id))
			}
		}

		bucketIDs := make([]string, 0, len(group.Buckets))
		bucketSlotsCount := 0
		for _, bucket := range group.Buckets {
			bucketSlotsCount += bucket.Slots
			bucketIDs = append(bucketIDs, bucket.ID)
		}
		if bucketSlotsCount != len(group.TeamIDs) {
			errs = append(errs, fmt.Sprintf(at+"Invalid amount of bucket slots. Have: %d, need: %d", bucketSlotsCount, len(group.TeamIDs)))
		}
		for _, duplicate := range findDulpicate(bucketIDs) {
			errs = append(errs, fmt.Sprintf(at+"Bucket %q is used twice", duplicate))
		}

	}
	for _, duplicate := range findDulpicate(groupIDs) {
		errs = append(errs, fmt.Sprintf(at+"Group id %q used twice", duplicate))
	}
	return errs
}

// round id duplicate
// name not nil
// match id duplicate
// round id duplicate
// a,b are in teams
// starts at is not earlier than match from previous section
//
//
//	type Round struct {
//		ID      string `json:"id"`
//		Name    string `json:"name"`
//		Section string `json:"section"` // rounds with the same section render on one row
//	}
//
//	type Match struct {
//		ID       string     `json:"id"`
//		RoundID  string     `json:"roundId"`
//		Label    string     `json:"label,omitempty"`
//		BestOf   int        `json:"bestOf"`
//		A        Slot       `json:"a"`
//		B        Slot       `json:"b"`
//		StartsAt *time.Time `json:"startsAt,omitempty"`
//	}

func validateBrackets(t *contract.TournamentInput, phase contract.Phase, at string, knownTeams []string) []string {
	errs := make([]string, 0, 32)

	roundsIDs := make([]string, 0, len(phase.Rounds))
	for _, round := range phase.Rounds {
		roundsIDs = append(roundsIDs, round.ID)
	}
	for _, duplicate := range findDulpicate(roundsIDs) {
		errs = append(errs, fmt.Sprintf(at+"Round ID %q used twice", duplicate))
	}

	matchIDs := make([]string, 0, len(phase.Matches))
	for _, match := range phase.Matches {
		matchIDs = append(matchIDs, match.ID)
	}
	for _, duplicate := range findDulpicate(matchIDs) {
		errs = append(errs, fmt.Sprintf(at+"Match ID %q used twice", duplicate))
	}
	return errs
}

func findDulpicate(ids []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, id := range ids {
		if seen[id] {
			out = append(out, id)
		}
		seen[id] = true
	}
	return out
}
