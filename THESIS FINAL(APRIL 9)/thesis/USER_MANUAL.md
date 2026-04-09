# 4.7.8 User Guide of the Program

This section presents the user guide of the developed Route Optimization and Visualization System. The system was designed to provide an interactive environment for viewing mapped blocks, poles, and network edges within Barangay Saray, while also allowing the user to compare optimized and actual traversal routes. In addition, the system supports route playback, road blockage simulation, and route comparison through graphical visualization.

The user guide is organized according to the major visible components of the program interface. Each subsection explains the purpose and function of a particular screen or interface component. For documentation purposes, screenshots may be inserted in the corresponding figure placeholders.

## 4.7.8.1 Default View

When the program is first opened, the user is directed to the default view of the system. In this view, the interface displays the header, the sidebar panel on the left, and the interactive map on the right. The default view serves as the starting point of the program and provides immediate access to the mapped blocks, route comparison chart, and map controls.

At this stage, the user may begin by selecting a block from the sidebar or by interacting directly with the map. The default view is intended to provide a general overview of the study area while preserving access to detailed route analysis features.

## 4.7.8.2 Sidebar Block List

The block list is located on the left side of the interface under the heading “Blocks.” It contains all mapped blocks from Block 1 to Block 11. Each block is represented by a clickable button, and each button is color-coded to correspond to its block polygon on the map. This allows the user to easily identify the selected or highlighted block.

The primary function of the block list is navigation. When the user clicks a block from the list, the route analysis modal for that block is opened. Hovering over a block in the list also provides a visual relationship with the map by emphasizing the corresponding block area. Through this component, the user can quickly access any block without manually locating it on the map.

**Figure 4.7.8.2. Sidebar Block List**

`[Insert screenshot of the block list here]`

## 4.7.8.3 Route Comparison Card

Below the block list is the Route Comparison card. This card contains a compact line graph comparing the optimized route and the actual route for all blocks. It serves as a quick analytical summary of route performance across the study area. The graph uses two colored lines: one for the optimized route and another for the actual route.

The card also contains a maximize button which opens a larger chart modal for more detailed inspection. This feature is useful when the user wants to compare route differences more clearly or present the route analysis in a more readable format.

**Figure 4.7.8.3. Route Comparison Card**

`[Insert screenshot of the route comparison card here]`

## 4.7.8.4 Main Map View

The main map view occupies the largest portion of the interface and serves as the primary visualization area of the program. It shows the block polygons, poles, and edges of the study area. The map supports zooming and panning, enabling the user to move from an overview of Barangay Saray to a more detailed block-level inspection.

At higher zoom levels, the poles and network edges become visible together with the colored block boundaries. The map also contains the base map control in the upper-left area, allowing the user to switch between the standard map and the black/night map. This flexibility improves map readability depending on user preference and presentation conditions.

**Figure 4.7.8.4. Main Map View**

`[Insert screenshot of the main map interface here]`

## 4.7.8.5 Map Legend

The map legend is positioned at the upper-right side of the map. It explains the meaning of the visual symbols used in the system, namely poles, blocks, and edges. This component is essential for helping the user correctly interpret the information displayed on the map.

Since multiple layers are shown simultaneously, the legend improves clarity by distinguishing the symbol for pole markers, block polygons, and edge paths. Through the legend, the user can understand the visual relationship between the mapped poles and the network structure used for route generation.

**Figure 4.7.8.5. Map Legend**

`[Insert screenshot of the legend here]`

## 4.7.8.6 Route Analysis Modal

When the user selects a block either from the sidebar or directly from the map, the route analysis modal is displayed. This modal is divided into two major panels. The left panel shows the route map of the selected block, while the right panel contains the controls, route metrics, and playback information.

This modal is the main workspace for route analysis. It enables the user to inspect the selected route in detail, switch between optimized and actual modes, and observe route progress through playback animation. It also allows the user to move to the previous or next block using the side navigation buttons without returning to the main map.

**Figure 4.7.8.6. Route Analysis Modal**

`[Insert screenshot of the full route analysis modal here]`

## 4.7.8.7 Route Playback Control Panel

The right side of the route analysis modal contains the route playback control panel. This panel includes the road control selector, playback speed options, optimized and actual route toggle, play/pause button, reset blocked-road button, and route metrics. It also displays the current node sequence and blocked-road summary.

The route metrics shown in this panel include the current traveled distance, route total distance, estimated walking time, and current node. These values update in relation to the route playback. This panel is especially important in analyzing how the traversal progresses over time and how route characteristics change when the route mode or road conditions are modified.

**Figure 4.7.8.7. Route Playback Control Panel**

`[Insert screenshot of the route playback control panel here]`

## 4.7.8.8 Enlarged Route Comparison Modal

The enlarged Route Comparison modal is opened by clicking the maximize button in the route comparison card. This modal presents a larger and clearer line graph of optimized and actual route distances for all blocks. Because of its larger size, it is more suitable for detailed analysis and thesis presentation.

The expanded chart allows the user to observe differences between route types more clearly. It also supports hover inspection for each block, making it easier to compare route distances and estimated times for both optimized and actual traversal paths.

**Figure 4.7.8.8. Enlarged Route Comparison Modal**

`[Insert screenshot of the enlarged route comparison modal here]`

## 4.7.8.9 General Procedure for Using the Program

To use the system, the user must first open the program in the browser. From the default view, the user may select a block from the sidebar or directly from the map. Once a block is selected, the route analysis modal appears, allowing inspection of the selected route.

Inside the modal, the user may choose the optimized or actual route, adjust playback speed, start route playback, and block or unblock specific roads. If further route comparison is needed, the user may maximize the route comparison chart from the sidebar. Through this process, the system supports both operational use and analytical demonstration for the thesis study.

