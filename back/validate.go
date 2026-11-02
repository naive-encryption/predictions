package main

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/naive-encryption/predictions/contract"
)

var (
	slug        = regexp.MustCompile("^[a-z0-9][a-z0-9-_]*$")
	validBestOf = map[int]bool{1: true, 3: true, 5: true}
)

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
	for _, duplicate := range findDuplicate(t.TeamIDs) {
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
	for _, duplicate := range findDuplicate(phaseIDs) {
		errs = append(errs, fmt.Sprintf("Phase id %q used twice", duplicate))
	}

	for _, phase := range t.Phases {
		at := phase.Name + ": "
		if !slug.MatchString(phase.ID) {
			errs = append(errs, "Phase id must be a lowercase slug")
		}
		switch phase.Kind {
		case "groups":
			errs = append(errs, validateGroups(&t, phase, at)...)
		case "bracket":
			errs = append(errs, validateBrackets(&t, phase, at)...)
		default:
			errs = append(errs, at+"Tournament kind must be 'groups' or 'bracket' ")
		}
	}

	return errs
}

func validateGroups(t *contract.TournamentInput, phase contract.Phase, at string) []string {
	errs := make([]string, 0, 32)
	groupIDs := make([]string, 0, len(phase.Groups))
	for _, group := range phase.Groups {

		groupIDs = append(groupIDs, group.ID)
		for _, duplicate := range findDuplicate(group.TeamIDs) {
			errs = append(errs, fmt.Sprintf(at+"Team %q is listed twice", duplicate))
		}

		for _, id := range group.TeamIDs {
			if !slices.Contains(t.TeamIDs, id) {
				errs = append(errs, fmt.Sprintf(at+"Unknown team %q", id))
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
		for _, duplicate := range findDuplicate(bucketIDs) {
			errs = append(errs, fmt.Sprintf(at+"Bucket %q is used twice", duplicate))
		}

	}
	for _, duplicate := range findDuplicate(groupIDs) {
		errs = append(errs, fmt.Sprintf(at+"Group id %q used twice", duplicate))
	}
	return errs
}

func validateBrackets(t *contract.TournamentInput, phase contract.Phase, at string) []string {
	errs := make([]string, 0, 32)
	tournamentTeams := make(map[string]bool)
	for _, teamID := range t.TeamIDs {
		tournamentTeams[teamID] = true
	}

	roundsIDs := make([]string, 0, len(phase.Rounds))
	roundsIDsSet := make(map[string]bool)
	for _, round := range phase.Rounds {
		roundsIDs = append(roundsIDs, round.ID)
		roundsIDsSet[round.ID] = true
	}
	for _, duplicate := range findDuplicate(roundsIDs) {
		errs = append(errs, fmt.Sprintf(at+"Round ID %q used twice", duplicate))
	}

	matchIDs := make([]string, 0, len(phase.Matches))
	seenMatchIDs := make(map[string]bool)
	fedMatchIDs := make(map[string]bool)
	for _, match := range phase.Matches {
		if !roundsIDsSet[match.RoundID] {
			errs = append(errs, fmt.Sprintf(at+"Invalid round id: %q in match ID: %q", match.RoundID, match.ID))
		}
		if !validBestOf[match.BestOf] {
			errs = append(errs, fmt.Sprintf(at+"Invalid best of: \"%d\" in match ID: %q", match.BestOf, match.ID))
		}
		for _, slot := range []contract.Slot{match.A, match.B} {
			switch {
			case slot.TBD:
				if slot.TeamID != "" && !tournamentTeams[slot.TeamID] {
					errs = append(errs, fmt.Sprintf(at+"Unknown team: %q in match ID: %q", slot.TeamID, match.ID))
				}
			case slot.From != "":
				if !seenMatchIDs[slot.From] {
					errs = append(errs, fmt.Sprintf(at+"Invalid 'From': %q in match ID: %q", slot.From, match.ID))
					continue
				}
				if slot.Take != "winner" && slot.Take != "loser" {
					errs = append(errs, fmt.Sprintf(at+"'Take' must be 'winner' or 'loser' in match ID: %q", match.ID))
					continue
				}
				if fedMatchIDs[slot.From+":"+slot.Take] {
					errs = append(errs, fmt.Sprintf(at+"%s of %s is already used", slot.Take, slot.From))
					continue
				}
				fedMatchIDs[slot.From+":"+slot.Take] = true
			case slot.TeamID != "":
				if !tournamentTeams[slot.TeamID] {
					errs = append(errs, fmt.Sprintf(at+"Unknown team: %q in match ID: %q", slot.TeamID, match.ID))
				}
			default:
				errs = append(errs, fmt.Sprintf(at+"Invalid or empty slot in matchID: %q", match.ID))
			}
		}
		seenMatchIDs[match.ID] = true
		matchIDs = append(matchIDs, match.ID)
	}
	for _, duplicate := range findDuplicate(matchIDs) {
		errs = append(errs, fmt.Sprintf(at+"Match ID %q used twice", duplicate))
	}
	return errs
}

func findDuplicate(ids []string) []string {
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
