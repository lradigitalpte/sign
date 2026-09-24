package send

type snapshot struct {
	EnvelopeID string
	Title      string
	Status     string
	Documents  []snapshotDocument
	Recipients []snapshotRecipient
	Fields     []snapshotField
}

type snapshotDocument struct {
	ID        string
	Filename  string
	PageCount int
}

type snapshotRecipient struct {
	ID           string
	Name         string
	Email        string
	Role         string
	SigningOrder int
}

type snapshotField struct {
	DocumentID  string
	RecipientID string
	Type        string
	Page        int
	Required    bool
}

func actionableRole(role string) bool {
	return role == "signer" || role == "approver" || role == "viewer"
}

func evaluate(s snapshot) Review {
	review := Review{
		EnvelopeID:  s.EnvelopeID,
		Title:       s.Title,
		Status:      s.Status,
		Errors:      []string{},
		Warnings:    []string{},
		Documents:   []ReviewDocument{},
		Recipients:  []ReviewRecipient{},
		FieldCounts: FieldCounts{ByType: map[string]int{}},
	}

	docPages := map[string]int{}
	docFieldCount := map[string]int{}
	for _, document := range s.Documents {
		docPages[document.ID] = document.PageCount
		review.Documents = append(review.Documents, ReviewDocument{
			ID:        document.ID,
			Filename:  document.Filename,
			PageCount: document.PageCount,
		})
	}

	emails := map[string]int{}
	orders := map[int]struct{}{}
	actionable := 0
	missingEmail := false
	for _, recipient := range s.Recipients {
		if recipient.Email == "" {
			if actionableRole(recipient.Role) {
				missingEmail = true
			}
		} else {
			emails[recipient.Email]++
		}
		if actionableRole(recipient.Role) {
			actionable++
			orders[recipient.SigningOrder] = struct{}{}
		}
		review.Recipients = append(review.Recipients, ReviewRecipient{
			ID:           recipient.ID,
			Name:         recipient.Name,
			Email:        recipient.Email,
			Role:         recipient.Role,
			SigningOrder: recipient.SigningOrder,
			Actionable:   actionableRole(recipient.Role),
		})
	}

	recipientIndex := map[string]int{}
	for i, recipient := range review.Recipients {
		recipientIndex[recipient.ID] = i
	}

	invalidPage := false
	invalidRecipient := false
	invalidDocument := false
	for _, field := range s.Fields {
		review.FieldCounts.Total++
		if field.Required {
			review.FieldCounts.Required++
		}
		review.FieldCounts.ByType[field.Type]++
		docFieldCount[field.DocumentID]++
		pages, ok := docPages[field.DocumentID]
		if !ok {
			invalidDocument = true
		} else if field.Page < 1 || field.Page > pages {
			invalidPage = true
		}
		index, ok := recipientIndex[field.RecipientID]
		if !ok {
			invalidRecipient = true
			continue
		}
		review.Recipients[index].FieldCount++
		if field.Required {
			review.Recipients[index].RequiredFieldCount++
		}
	}
	for i := range review.Documents {
		review.Documents[i].FieldCount = docFieldCount[review.Documents[i].ID]
	}

	signerMissing := false
	soloSelfSignLayout := len(s.Fields) == 0 && len(review.Recipients) == 1 && review.Recipients[0].Role == "signer"
	for i, recipient := range review.Recipients {
		if recipient.Role == "signer" && recipient.RequiredFieldCount == 0 {
			if soloSelfSignLayout {
				continue
			}
			review.Recipients[i].MissingRequiredFields = true
			signerMissing = true
		}
	}

	duplicateEmail := false
	for _, count := range emails {
		if count > 1 {
			duplicateEmail = true
			break
		}
	}

	if len(s.Documents) == 0 {
		review.Errors = append(review.Errors, "Add at least one PDF document")
	}
	if actionable == 0 {
		review.Errors = append(review.Errors, "Add at least one signer, approver, or viewer")
	}
	if signerMissing {
		review.Errors = append(review.Errors, "Every signer must have at least one required field")
	}
	if invalidDocument || invalidRecipient {
		review.Errors = append(review.Errors, "All fields must reference a document and recipient on this envelope")
	}
	if invalidPage {
		review.Errors = append(review.Errors, "All fields must reference a valid document page")
	}
	if duplicateEmail {
		review.Errors = append(review.Errors, "Recipient email addresses must be unique")
	}
	if missingEmail {
		review.Errors = append(review.Errors, "Every recipient needs an email address before this can be sent")
	}
	if orderError := signingOrderError(orders, actionable); orderError != "" {
		review.Errors = append(review.Errors, orderError)
	}
	if review.FieldCounts.Total == 0 {
		review.Warnings = append(review.Warnings, "No document fields have been placed")
	}

	review.Ready = len(review.Errors) == 0
	return review
}

func signingOrderError(orders map[int]struct{}, actionable int) string {
	if actionable == 0 {
		return ""
	}
	max := 0
	for order := range orders {
		if order < 1 {
			return "Signing order must start at 1"
		}
		if order > max {
			max = order
		}
	}
	if _, ok := orders[1]; !ok {
		return "Signing order must start at 1"
	}
	for step := 1; step <= max; step++ {
		if _, ok := orders[step]; !ok {
			return "Signing order cannot skip steps"
		}
	}
	return ""
}
