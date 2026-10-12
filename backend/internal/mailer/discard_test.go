package mailer

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewSenderPicksBySettings(t *testing.T) {
	require.NoError(t, DiscardSender{}.Send(context.Background(), Message{}))
	require.IsType(t, DiscardSender{}, NewSender(Config{Driver: DriverDiscard, APIKey: "k"}, nil), "discard wins over a key")
	require.IsType(t, &ResendSender{}, NewSender(Config{APIKey: "k"}, nil))
	require.Nil(t, NewSender(Config{}, nil))
}
