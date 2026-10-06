package family

// FailTokens makes the service's token generator fail, as a broken random source would.
func (s *Service) FailTokens(err error) {
	s.newToken = func() (string, []byte, error) { return "", nil, err }
}
