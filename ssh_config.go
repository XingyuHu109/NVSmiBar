package main

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type SSHConfigConnection struct {
	Name   string `json:"name"`
	Target string `json:"target"`
	Port   int    `json:"port"`
	Source string `json:"source"`
}

type hostBlock struct {
	patterns []string
	hostName string
	user     string
	port     int
}

func discoverSSHConfigConnections() ([]SSHConfigConnection, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return []SSHConfigConnection{}, err
	}
	root := filepath.Join(home, ".ssh", "config")
	if _, err := os.Stat(root); err != nil {
		if os.IsNotExist(err) {
			return []SSHConfigConnection{}, nil
		}
		return []SSHConfigConnection{}, err
	}

	visited := map[string]bool{}
	seen := map[string]bool{}
	connections := []SSHConfigConnection{}
	if err := parseSSHConfigFile(root, home, visited, seen, &connections); err != nil {
		return []SSHConfigConnection{}, err
	}

	sort.Slice(connections, func(i, j int) bool {
		if connections[i].Name != connections[j].Name {
			return connections[i].Name < connections[j].Name
		}
		if connections[i].Target != connections[j].Target {
			return connections[i].Target < connections[j].Target
		}
		return connections[i].Port < connections[j].Port
	})

	return connections, nil
}

func parseSSHConfigFile(path string, home string, visited map[string]bool, seen map[string]bool, out *[]SSHConfigConnection) error {
	resolved, err := filepath.Abs(path)
	if err != nil {
		resolved = path
	}
	if visited[resolved] {
		return nil
	}
	visited[resolved] = true

	file, err := os.Open(resolved)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var block *hostBlock
	fileDir := filepath.Dir(resolved)

	flush := func() {
		if block == nil {
			return
		}
		for _, pattern := range block.patterns {
			if pattern == "" || pattern == "*" || strings.HasPrefix(pattern, "!") {
				continue
			}
			if strings.ContainsAny(pattern, "*?") {
				continue
			}

			target := pattern
			if block.hostName != "" {
				target = block.hostName
			}
			if block.user != "" {
				target = block.user + "@" + target
			}

			key := pattern + "|" + target + "|" + strconv.Itoa(block.port)
			if seen[key] {
				continue
			}
			seen[key] = true

			*out = append(*out, SSHConfigConnection{
				Name:   pattern,
				Target: target,
				Port:   block.port,
				Source: "ssh_config",
			})
		}
		block = nil
	}

	for scanner.Scan() {
		line := strings.TrimSpace(stripSSHComments(scanner.Text()))
		if line == "" {
			continue
		}

		key, value := splitSSHDirective(line)
		if key == "" {
			continue
		}

		switch strings.ToLower(key) {
		case "include":
			patterns := strings.Fields(value)
			for _, pattern := range patterns {
				for _, includePath := range resolveIncludePaths(pattern, fileDir, home) {
					_ = parseSSHConfigFile(includePath, home, visited, seen, out)
				}
			}
		case "host":
			flush()
			block = &hostBlock{patterns: strings.Fields(value)}
		case "hostname":
			if block != nil {
				block.hostName = trimSSHValue(value)
			}
		case "user":
			if block != nil {
				block.user = trimSSHValue(value)
			}
		case "port":
			if block != nil {
				if p, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
					block.port = p
				}
			}
		}
	}
	flush()

	return scanner.Err()
}

func stripSSHComments(line string) string {
	inSingle := false
	inDouble := false
	for i, r := range line {
		switch r {
		case '\'':
			if !inDouble {
				inSingle = !inSingle
			}
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
		case '#':
			if !inSingle && !inDouble {
				return line[:i]
			}
		}
	}
	return line
}

func splitSSHDirective(line string) (string, string) {
	idx := strings.IndexAny(line, " \t")
	if idx < 0 {
		return strings.TrimSpace(line), ""
	}
	key := strings.TrimSpace(line[:idx])
	value := strings.TrimSpace(line[idx:])
	return key, value
}

func trimSSHValue(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "\"")
	value = strings.TrimSuffix(value, "\"")
	return value
}

func resolveIncludePaths(pattern string, fileDir string, home string) []string {
	pattern = trimSSHValue(pattern)
	if strings.HasPrefix(pattern, "~/") {
		pattern = filepath.Join(home, strings.TrimPrefix(pattern, "~/"))
	}
	if !filepath.IsAbs(pattern) {
		pattern = filepath.Join(fileDir, pattern)
	}

	matches := []string{}
	if hasGlob(pattern) {
		globbed, err := filepath.Glob(pattern)
		if err != nil {
			return []string{}
		}
		for _, p := range globbed {
			if info, err := os.Stat(p); err == nil && !info.IsDir() {
				matches = append(matches, p)
			}
		}
		return matches
	}

	if info, err := os.Stat(pattern); err == nil && !info.IsDir() {
		matches = append(matches, pattern)
	}
	return matches
}

func hasGlob(path string) bool {
	return strings.ContainsAny(path, "*?[]")
}
