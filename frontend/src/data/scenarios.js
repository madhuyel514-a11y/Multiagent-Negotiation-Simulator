export const scenarios = [
  {
    id: 1,
    title: 'Flood Relief Resource Allocation',
    description:
      'Allocate food, medicine, rescue boats, temporary shelters, and emergency supplies among affected districts.',
    category: 'Flood Response',
    objective:
      'Fairly allocate limited emergency resources across affected districts while prioritizing life-saving operations.',
    resources: ['Food', 'Medicine', 'Rescue Boats', 'Temporary Shelters', 'Emergency Supplies'],
    challenges: [
      'Limited resources',
      'Damaged transportation routes',
      'Unequal district requirements'
    ],
    negotiationFocus: 'Prioritizing resource allocation between stakeholders',
    agents: [
      {
        id: 1,
        name: 'Government Agent',
        role: 'National Disaster Management Authority',
        goal: 'Distribute resources fairly while maintaining public safety and policy compliance.',
        constraints: [
          'Limited emergency budget',
          'Strict government protocols',
          'Need to prioritize life-saving operations'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 2,
        name: 'NGO Agent',
        role: 'Relief Coordination Partner',
        goal: 'Ensure vulnerable communities receive essential aid quickly and efficiently.',
        constraints: [
          'Dependence on donor funding',
          'Limited transport capacity',
          'Need to coordinate with multiple field teams'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 3,
        name: 'District Administration Agent',
        role: 'Local Emergency Operations Office',
        goal: 'Match incoming aid to the most urgent local needs and manage ground logistics.',
        constraints: [
          'Restricted local infrastructure',
          'Communication delays during severe weather',
          'Competing local demands for limited supplies'
        ],
        defaultPersonality: 'Collaborative'
      }
    ]
  },
  {
    id: 2,
    title: 'Earthquake Emergency Response',
    description:
      'Coordinate rescue teams, medical aid, debris clearance, and temporary shelters after a major earthquake.',
    category: 'Emergency Response',
    objective:
      'Rapidly coordinate search-and-rescue and medical aid while restoring essential services.',
    resources: ['Rescue Teams', 'Medical Aid', 'Temporary Shelters', 'Debris Clearance Equipment'],
    challenges: [
      'Restricted access to damaged zones',
      'Overwhelmed medical facilities',
      'Broken transport infrastructure'
    ],
    negotiationFocus: 'Coordinating rescue priorities and medical resource distribution',
    agents: [
      {
        id: 1,
        name: 'Government Agent',
        role: 'National Emergency Response Unit',
        goal: 'Direct search-and-rescue operations while protecting critical infrastructure and public order.',
        constraints: [
          'Restricted access to damaged zones',
          'High demand for rescue personnel',
          'Need to coordinate multi-agency response'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 2,
        name: 'NGO Agent',
        role: 'Medical and Humanitarian Relief Network',
        goal: 'Provide urgent medical support and shelter assistance to displaced families.',
        constraints: [
          'Limited medical stockpiles',
          'Complex supply chain disruption',
          'Need to secure safe transport routes'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 3,
        name: 'District Administration Agent',
        role: 'Municipal Disaster Coordination Office',
        goal: 'Prioritize rescue access, shelter placement, and local infrastructure support.',
        constraints: [
          'Damaged roads and utilities',
          'Crowded evacuation centers',
          'Limited workforce availability'
        ],
        defaultPersonality: 'Collaborative'
      }
    ]
  },
  {
    id: 3,
    title: 'Cyclone Relief Coordination',
    description:
      'Coordinate evacuation efforts, food distribution, infrastructure restoration, and emergency communication after a cyclone.',
    category: 'Cyclone Relief',
    objective:
      'Organize safe evacuations and restore vital services while distributing emergency supplies efficiently.',
    resources: ['Evacuation Transport', 'Food', 'Shelter Materials', 'Communication Equipment'],
    challenges: [
      'Severe weather disruption',
      'Widespread infrastructure damage',
      'Intermittent power and communications'
    ],
    negotiationFocus: 'Balancing evacuation, distribution, and infrastructure repair priorities',
    agents: [
      {
        id: 1,
        name: 'Government Agent',
        role: 'Civil Protection and Disaster Management Department',
        goal: 'Safeguard residents through organized evacuation and rapid restoration of essential services.',
        constraints: [
          'Severe weather disruption',
          'Limited transport and power supply',
          'Need to maintain public communication channels'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 2,
        name: 'NGO Agent',
        role: 'Community Relief and Recovery Partner',
        goal: 'Deliver food, shelter, and communication support to affected households.',
        constraints: [
          'Storm-damaged distribution routes',
          'Volunteer availability fluctuations',
          'Need to manage temporary warehousing'
        ],
        defaultPersonality: 'Collaborative'
      },
      {
        id: 3,
        name: 'District Administration Agent',
        role: 'Regional Coordination and Recovery Office',
        goal: 'Coordinate local evacuation centers, infrastructure repair priorities, and public updates.',
        constraints: [
          'Limited repair equipment',
          'Intermittent network connectivity',
          'High demand from multiple affected communities'
        ],
        defaultPersonality: 'Collaborative'
      }
    ]
  }
];
