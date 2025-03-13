#!/usr/bin/env python3
"""
This script generates a dynamic M3U8 link.
Usage: python generate_m3u8_link.py <username>
"""

import sys

def generate_m3u8_link(username: str) -> str:
    # Template URL with a placeholder for the username.
    template = (
        "https://edge19-mad.live.mmcdn.com/live-fhls/amlst:{username}-sd-02ef6d283270b8610dff02e92ec387538f2cae2e0134533cd68a2a471ebcedd6_trns_h264/"
        "chunklist_w1322618375_b2700000_vo_sfm4s_t64RlBTOjI5Ljk3MDAyOTk3MDAyOTk3.m3u8"
    )
    # Replace {username} with the provided value.
    return template.format(username=username)

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_m3u8_link.py <username>")
        sys.exit(1)
    username = sys.argv[1]
    link = generate_m3u8_link(username)
    print("Generated M3U8 link:")
    print(link)

if __name__ == "__main__":
    main()

