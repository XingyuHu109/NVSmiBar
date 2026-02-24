package main

import "testing"

func TestParseOutputExtendedFields(t *testing.T) {
	raw := "0, NVIDIA RTX 4090, 78, 66, 10240, 24576, 45, 210.3, 450.0, 550.54.14, 12.4"
	gpus, err := parseOutput(raw, true)
	if err != nil {
		t.Fatalf("parseOutput returned error: %v", err)
	}
	if len(gpus) != 1 {
		t.Fatalf("expected 1 gpu, got %d", len(gpus))
	}
	gpu := gpus[0]
	if gpu.Index != 0 || gpu.Util != 78 || gpu.Temp != 66 {
		t.Fatalf("unexpected required fields: %+v", gpu)
	}
	if gpu.FanSpeed != 45 || gpu.PowerDraw != 210 || gpu.PowerLimit != 450 {
		t.Fatalf("unexpected optional numeric fields: %+v", gpu)
	}
	if gpu.DriverVersion != "550.54.14" || gpu.CudaVersion != "12.4" {
		t.Fatalf("unexpected optional string fields: %+v", gpu)
	}
}

func TestParseOutputWithNAFallbacks(t *testing.T) {
	raw := "1, NVIDIA T4, 22, 55, 1024, 15360, N/A, N/A, 70.0, 535.12.01"
	gpus, err := parseOutput(raw, false)
	if err != nil {
		t.Fatalf("parseOutput returned error: %v", err)
	}
	gpu := gpus[0]
	if gpu.FanSpeed != -1 {
		t.Fatalf("expected fan speed -1, got %d", gpu.FanSpeed)
	}
	if gpu.PowerDraw != -1 {
		t.Fatalf("expected power draw -1, got %d", gpu.PowerDraw)
	}
	if gpu.PowerLimit != 70 {
		t.Fatalf("expected power limit 70, got %d", gpu.PowerLimit)
	}
	if gpu.CudaVersion != "" {
		t.Fatalf("expected empty CUDA version, got %q", gpu.CudaVersion)
	}
}

func TestClassifyConnectionError(t *testing.T) {
	tests := []struct {
		name string
		err  string
		code string
	}{
		{name: "auth", err: "ssh: Permission denied (publickey)", code: "auth_failed"},
		{name: "host key", err: "ssh: Host key verification failed", code: "host_key"},
		{name: "dns", err: "ssh: Could not resolve hostname foo", code: "dns"},
		{name: "timeout", err: "ssh: Connection timed out", code: "timeout"},
		{name: "refused", err: "ssh: connect to host foo port 22: Connection refused", code: "refused"},
		{name: "nvidia", err: "ssh: bash: nvidia-smi: command not found", code: "nvidia_smi_missing"},
		{name: "unknown", err: "ssh: unexpected", code: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _ := classifyConnectionError(testErr(tt.err))
			if got != tt.code {
				t.Fatalf("expected code %q, got %q", tt.code, got)
			}
		})
	}
}

type testErr string

func (e testErr) Error() string { return string(e) }
